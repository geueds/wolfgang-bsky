import { Database } from './db'
import { BskyAgent } from '@atproto/api'

export type AppContext = {
  db: Database
  cfg: Config
  api: BskyAgent
  followers: {
    author: string
  }[]
  log: (text: string) => void
}

export type Config = {
  devel: boolean
  port: number
  listenhost: string
  hostname: string
  bskyIdentifier: string
  bskyPassword: string
  mysqlDatabase: string
  mysqlHost: string
  mysqlPort: number
  mysqlUser: string
  mysqlPassword: string
  subscriptionEndpoint: string
}
