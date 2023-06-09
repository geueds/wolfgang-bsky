import { Database } from './db'
import { BskyAgent } from "@atproto/api";

export type AppContext = {
  db: Database
  cfg: Config
  api: BskyAgent
}

export type Config = {
  bskyIdentifier: string
  bskyPassword: string
  mysqlDatabase: string
  mysqlHost: string
  mysqlUser: string
  mysqlPassword: string
  subscriptionEndpoint: string
}
