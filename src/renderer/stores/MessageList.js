import { callDcMethodAsync, ipcBackend } from '../ipc'
import { Store, useStore } from './store'
import logger from '../../logger'

export const PAGE_SIZE = 30

const defaultState = {
  chatId: -1,
  messageIds: [],
  messages: {},
  oldestFetchedMessageIndex: -1,
  scrollToBottom: false,
  scrollToBottomIfClose: false,
  scrollToLastPage: false,
  scrollHeight: 0,
  countFetchedMessages: 0
}

const MessageListStore = new Store(defaultState, 'MessageListStore')
const log = MessageListStore.log

MessageListStore.reducers.push(({ type, payload, chatId }, state) => {
  if (typeof chatId !== 'undefined' && chatId !== state.chatId) {
    log.debug('REDUCER', 'chatId changed, skipping action')
  }
  if (type === 'NEW_CHAT_SELECTED') {
    return { ...state, ...payload }
  } else if (type === 'FETCHED_MORE_MESSAGES') {
    return {
      ...state,
      messages: { ...state.messages, ...payload.fetchedMessages },
      oldestFetchedMessageIndex: payload.oldestFetchedMessageIndex,
      scrollToLastPage: true,
      scrollHeight: payload.scrollHeight,
      countFetchedMessages: payload.countFetchedMessages
    }
  } else if (type === 'FETCHED_INCOMING_MESSAGES') {
    return {
      ...state,
      messageIds: payload.messageIds,
      messages: { 
        ...state.messages,
        ...payload.messagesIncoming,
      },
      scrollToBottomIfClose: true
    }
  } else if (type === 'SCROLLED_TO_LAST_PAGE') {
    return { ...state, scrollToLastPage: false, scrollHeight: 0 }
  } else if (type === 'SCROLLED_TO_BOTTOM') {
    return { ...state, scrollToBottom: false }
  } else if (type === 'SCROLLED_TO_BOTTOM_IF_CLOSE') {
    return { ...state, scrollToBottomIfClose: false }
  } else if (type === 'UI_DELETE_MESSAGE') {
    const msgId = payload

    const messageIndex = state.messageIds.findIndex(mId => mId === msgId)
    const oldestFetchedMessageIndex = messageIndex === state.oldestFetchedMessageIndex
      ? messageIndex + 1
      : state.oldestFetchedMessageIndex
    const messageIds = [
      ...state.messageIds.slice(0, messageIndex),
      ...state.messageIds.slice(messageIndex + 1)
    ]
    const messages = { ...state.messages, [msgId]: null }
    return { ...state, messageIds, messages, oldestFetchedMessageIndex }
  } else if (type === 'MESSAGE_CHANGED') {
    return { ...state, messages: { ...state.messages, ...payload.messagesChanged }} 
  } else if (type === 'SENT_MESSAGE') {
    const [messageId, message] = payload
    const messageIds = [...state.messageIds, messageId]
    const messages = { ...state.messages, [messageId]: message }
    return { ...state, messageIds, messages, scrollToBottom: true }
  } else if (type === 'MESSAGE_DELIVERED') {
    const messages = {
      ...state.messages,
      [payload]: {
        ...state.messages[payload],
        msg: {
          ...state.messages[payload].msg,
          status: 'delivered'
        }
      }
    }
    return { ...state, messages }
  }

  return state
})

MessageListStore.effects.push(async ({ type, payload }, state) => {
  if (type === 'SELECT_CHAT') {
    const chatId = payload
    log.debug('SELECT CHAT:', chatId)
    const messageIds = await callDcMethodAsync('messageList.getMessageIds', [chatId])
    const oldestFetchedMessageIndex = messageIds.length - PAGE_SIZE
    const newestFetchedMessageIndex = messageIds.length
    const messageIdsToFetch = messageIds.slice(oldestFetchedMessageIndex, newestFetchedMessageIndex)
    const messages = await callDcMethodAsync('messageList.getMessages', [messageIdsToFetch])
    MessageListStore.dispatch({
      type: 'NEW_CHAT_SELECTED',
      payload: {
        chatId,
        messageIds,
        messages,
        oldestFetchedMessageIndex,
        scrollToBottom: true
      }
    })
  } else if (type === 'FETCH_MORE_MESSAGES') {
    const oldestFetchedMessageIndex = Math.max(state.oldestFetchedMessageIndex - 30, 0)
    const lastMessageIndexOnLastPage = state.oldestFetchedMessageIndex
    if (lastMessageIndexOnLastPage === 0) return
    console.log(oldestFetchedMessageIndex, lastMessageIndexOnLastPage)
    const fetchedMessageIds = state.messageIds.slice(
      oldestFetchedMessageIndex,
      lastMessageIndexOnLastPage
    )
    if (fetchedMessageIds.length === 0) return

    const fetchedMessages = await callDcMethodAsync('messageList.getMessages', [fetchedMessageIds])
    console.log('fetchedMessages', fetchedMessages)

    MessageListStore.dispatch({
      type: 'FETCHED_MORE_MESSAGES',
      payload: {
        fetchedMessages,
        oldestFetchedMessageIndex,
        countFetchedMessages: fetchedMessageIds.length,
        scrollHeight: payload.scrollHeight
      }
    })
  } else if (type === 'SEND_MESSAGE') {
    if (payload[0] !== MessageListStore.state.chatId) return
    const messageObj = await callDcMethodAsync('messageList.sendMessage', payload)
    MessageListStore.dispatch({ type: 'SENT_MESSAGE', payload: messageObj, chatId: payload[0] })
  }
})

ipcBackend.on('DC_EVENT_MSG_DELIVERED', (evt, [chatId, msgId]) => {
  MessageListStore.dispatch({
    type: 'MESSAGE_DELIVERED',
    chatId,
    payload: msgId
  })
})

ipcBackend.on('DC_EVENT_INCOMING_MSG', async (_, chatId, messageIdIncoming) => {
  if (chatId !== MessageListStore.state.chatId) return
  const messageIds = await callDcMethodAsync('messageList.getMessageIds', [chatId])
  const messageIdsIncoming = messageIds.filter(x => !MessageListStore.state.messageIds.includes(x))
  const messagesIncoming = await callDcMethodAsync('messageList.getMessages', [messageIdsIncoming])
  MessageListStore.dispatch({
    type: 'FETCHED_INCOMING_MESSAGES',
    payload: {
      messageIds,
      messageIdsIncoming,
      messagesIncoming
    }
  })
})

ipcBackend.on('DC_EVENT_MSGS_CHANGED', async (_, [chatId, messageId]) => {
  log.debug('DC_EVENT_MSGS_CHANGED', chatId, messageId)
  if (chatId !== MessageListStore.state.chatId) return
  if (MessageListStore.state.messageIds.indexOf(messageId) !== -1) {
    log.debug('DC_EVENT_MSGS_CHANGED', 'changed message seems to be message we already know')
    const messagesChanged = await callDcMethodAsync('messageList.getMessages', [[messageId]])
    MessageListStore.dispatch({
      type: 'MESSAGE_CHANGED',
      payload: {
        messageId,
        messagesChanged
      }
    }) 
  } else {
    log.debug('DC_EVENT_MSGS_CHANGED', 'changed message seems to be a new message')
    const messageIds = await callDcMethodAsync('messageList.getMessageIds', [chatId])
    const messageIdsIncoming = messageIds.filter(x => !MessageListStore.state.messageIds.includes(x))
    const messagesIncoming = await callDcMethodAsync('messageList.getMessages', [messageIdsIncoming])
    MessageListStore.dispatch({
      type: 'FETCHED_INCOMING_MESSAGES',
      payload: {
        messageIds,
        messageIdsIncoming,
        messagesIncoming
      }
    })
  }
})

export default MessageListStore
export const useMessageListStore = () => useStore(MessageListStore)