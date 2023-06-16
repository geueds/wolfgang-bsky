import http from 'http'
import events from 'events'
import express from 'express'
import { createDb, Database } from './db'
import { AppContext, Config } from './config'
import { BskyAgent } from '@atproto/api'
import rateLimit from 'express-rate-limit'

import path from 'path'
import indexRoute from './routes/index'
import feedsRoute from './routes/feeds'

import scheduledTasks from './tasks'
import * as dData from './derived_data'

var favicon = require('serve-favicon')

var i18n = require("i18n")
i18n.configure({
  locales: ['en', 'pt-BR'],
  directory: path.join(__dirname, '/i18n')
})

export class Wolfgang {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public cfg: Config
  public api: BskyAgent

  constructor(
    app: express.Application,
    db: Database,
    cfg: Config,
    api: BskyAgent
  ) {
    this.app = app
    this.db = db
    this.cfg = cfg
    this.api = api
  }

  static async create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.mysqlDatabase, cfg.mysqlHost, cfg.mysqlPort, cfg.mysqlUser, cfg.mysqlPassword)
    const api = new BskyAgent({service: 'https://bsky.social'})
    await api.login({
      identifier: cfg.bskyIdentifier,
      password: cfg.bskyPassword
    })

    const log = (text: string) => {
      console.log(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    const ctx: AppContext = {
      db,
      cfg,
      api,
      followers: [],
      log,
    }

    if (!cfg.devel) {
      app.set('trust proxy', true)
      app.get('/ip', (request, response) => response.send(request.ip))
    }

    app.use(rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false, 
    }))

    ctx.followers = await dData.updateLickablePeople(ctx)
    if (!cfg.devel) {
      scheduledTasks(ctx)
    }

    app.use('/static', express.static(path.join(__dirname, 'public')))

    // app.use(cors(), function(req, res, next) {
    //   res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    //   res.header(
    //     "Access-Control-Allow-Headers",
    //     "Origin, X-Requested-With, Content-Type, Accept"
    //   );
    //   next();
    // });

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.set("view engine", "pug");
    app.set("views", path.join(__dirname, "views"));
    app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))

    app.use(i18n.init)

    app.use(indexRoute(ctx))
    app.use(feedsRoute(ctx))

    return new Wolfgang(app, db, cfg, api)
  }

  async start(): Promise<http.Server> {
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default Wolfgang
