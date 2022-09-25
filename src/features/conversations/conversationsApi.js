import io from 'socket.io-client'
import { apiSlice } from '../api/apiSlice'
import { messagesApi } from '../messages/messagesApi'


export const conversationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query({
      query: (email) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=1&_limit=${process.env.REACT_APP_CONVERSATIONS_PER_PAGE}`,
      transformResponse(apiResponse, meta) {
        const totalCount = meta.response.headers.get('X-Total-Count')
        return {
          data: apiResponse,
          totalCount,
        }
      },
      async onCacheEntryAdded(
        arg,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved, dispatch },
      ) {
        const socket = io('https://chat-app-lws.herokuapp.com', {
          reconnectionDelay: 1000,
          reconnection: true,
          reconnectionAttemps: 10,
          transports: ['websocket'],
          agent: false,
          upgrade: false,
          rejectUnauthorized: false,
        })
    
        // create socket
        try {
          await cacheDataLoaded
          socket.on('message', (data) => {
            dispatch(
              apiSlice.util.updateQueryData(
                'getMessages',
                data?.data?.conversationId?.toString(),
                (draft) => {
                  draft.push(data?.data)
                },
              ),
            )
          })
          socket.on('conversation', (data) => {
            updateCachedData((draft) => {
              // eslint-disable-next-line eqeqeq
              const conversation = draft.data.find((c) => c.id == data?.data?.id)
              if (conversation?.id) {
                conversation.message = data?.data?.message
                conversation.timestamp = data?.data?.timestamp
              } else {
                draft.data.unshift(data.data)
              }
            })
          })
        } catch (err) {}
        await cacheEntryRemoved
        socket.close()
      },
    }),
    getMoreConversations: builder.query({
      query: ({ email, page }) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=${page}&_limit=${process.env.REACT_APP_CONVERSATIONS_PER_PAGE}`,
      async onQueryStarted({ email }, { queryFulfilled, dispatch }) {
        try {
          const conversations = await queryFulfilled
          if (conversations?.data?.length > 0) {
            // update conversation cache pessimistically start
            dispatch(
              apiSlice.util.updateQueryData('getConversations', email, (draft) => {
                return {
                  data: [...draft.data, ...conversations.data],
                  totalCount: Number(draft.totalCount),
                }
              }),
            )
            // update messages cache pessimistically end
          }
        } catch (err) {}
      },
    }),
    getConversation: builder.query({
      query: ({ userEmail, participantEmail }) =>
        `/conversations?participants_like=${userEmail}-${participantEmail}&&participants_like=${participantEmail}-${userEmail}`,
    }),
    addConversation: builder.mutation({
      query: ({ sender, data }) => ({
        url: '/conversations',
        method: 'POST',
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        const conversation = await queryFulfilled
        if (conversation?.data?.id) {
          // silent entry to message table
          const users = arg.data.users
          const senderUser = users.find((user) => user.email === arg.sender)
          const receiverUser = users.find((user) => user.email !== arg.sender)
          try {
            if (conversation?.data?.id) {
              await dispatch(
                messagesApi.endpoints.addMessage.initiate({
                  conversationId: conversation?.data?.id,
                  sender: senderUser,
                  receiver: receiverUser,
                  message: arg.data.message,
                  timestamp: arg.data.timestamp,
                  id: arg.data.id,
                }),
              ).unwrap()
            }
          } catch (err) {}
        }
      },
    }),
    editConversation: builder.mutation({
      query: ({ id, data, sender }) => ({
        url: `/conversations/${id}`,
        method: 'PATCH',
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        // optimistic cache update start
        const pathResult = dispatch(
          apiSlice.util.updateQueryData('getConversations', arg.sender, (draft) => {
            // eslint-disable-next-line eqeqeq
            const draftConversation = draft.data.find((c) => c.id == arg.id)
            draftConversation.message = arg.data.message
            draftConversation.timestamp = arg.data.timestamp
          }),
        )
        // optimistic cache update end

        try {
          const conversation = await queryFulfilled
          if (conversation?.data?.id) {
            // silent entry to message table
            const users = arg.data.users
            const senderUser = users.find((user) => user.email === arg.sender)
            const receiverUser = users.find((user) => user.email !== arg.sender)

            await dispatch(
              messagesApi.endpoints.addMessage.initiate({
                conversationId: conversation?.data?.id,
                sender: senderUser,
                receiver: receiverUser,
                message: arg.data.message,
                timestamp: arg.data.timestamp,
              }),
            ).unwrap()
          }
        } catch (err) {
          pathResult.undo()
        }
      },
    }),
  }),
})

export const {
  useGetConversationsQuery,
  useGetConversationQuery,
  useAddConversationMutation,
  useEditConversationMutation,
} = conversationsApi
