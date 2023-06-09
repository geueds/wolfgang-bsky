import { createDb, Database } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import { BskyAgent } from '@atproto/api'

export class Wolfgang {
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config
  public api: BskyAgent

  constructor(
    db: Database,
    firehose: FirehoseSubscription,
    cfg: Config,
    api: BskyAgent
  ) {
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
    this.api = api
  }

  static create(cfg: Config) {
    const db = createDb(cfg.mysqlDatabase, cfg.mysqlHost, cfg.mysqlUser, cfg.mysqlPassword)
    const api = new BskyAgent({service: 'https://bsky.social'})
    const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint, api)
    const ctx: AppContext = {
      db,
      cfg,
      api,
    }
    return new Wolfgang(db, firehose, cfg, api)
  }

  async start(): Promise<void> {
    await this.api.login({
      identifier: this.cfg.bskyIdentifier,
      password: this.cfg.bskyPassword
    })
    this.firehose.run()
  }
}

export default Wolfgang
