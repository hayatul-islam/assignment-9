import { useSelector } from 'react-redux'
import Message from './Message'
import _ from 'lodash'
export default function Messages({ messages = [] }) {
  const { user } = useSelector((state) => state.auth) || {}
  const { email } = user || {}

  const uniqueMessages = messages?.length && _.uniq(messages)
  return (
    <div className="relative w-full h-[calc(100vh_-_197px)] p-6 overflow-y-auto flex flex-col-reverse">
      <ul className="space-y-2">
        {uniqueMessages
          .slice()
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((message, i) => {
            const { message: lastMessage, sender } = message || {}

            const justify = sender.email !== email ? 'start' : 'end'

            return <Message key={i} justify={justify} message={lastMessage} />
          })}
      </ul>
    </div>
  )
}
