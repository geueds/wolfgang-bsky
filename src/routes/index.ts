import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import rateLimit from 'express-rate-limit'
import * as dData from '../derived_data'
import { maybeStr } from '../index'
import { StatsTable } from './stats'

export const getProfile = async (ctx: AppContext, handle: string) => {
  return await ctx.db
    .selectFrom('profiles')
    .select(['did', 'handle', 'displayName', 'avatar'])
    .where(({ or, cmpr }) =>
      or([
        cmpr('did', '=', handle),
        cmpr('handle', '=', handle),
        cmpr('handle', '=', `${handle}.bsky.social`),
      ]),
    )
    .limit(1)
    .executeTakeFirst()
}

export default function (ctx: AppContext) {
  const router = express.Router()

  // router.get('/', async (req, res) => {
  //   return res.render('index')
  // })

  router.get('/update/:name/:value?', async (req, res) => {
    ctx.log(
      `[data] request @ /update/${req.params.name}/${req.params.value} from ${req.ip}`,
    )
    if (!['127.0.0.1', '::1'].includes(req.ip)) {
      res.end()
    }

    if (req.params.name === 'stats') {
      if (!!req.params.value) {
        await dData.updateHistogram(ctx, req.params.value as StatsTable, true)
        res.send('done')
      }
    }

    if (req.params.name === 'follows') {
      await dData.updateTopFollowed(ctx)
      res.send('done!')
    }

    if (req.params.name === 'blocks') {
      await dData.updateTopBlocked(ctx)
      res.send('done!')
    }

    if (req.params.name === 'posts') {
      await dData.updateTopPosters(ctx)
      res.send('done!')
    }

    if (req.params.name === 'profile') {
      if (!!req.params.value) {
        const profile = await dData.updateProfile(ctx, req.params.value)
        if (!!profile) {
          res.json(profile)
        } else {
          res.send('error getting profile')
        }
      } else {
        res.send('no value given')
      }
    }

    res.end()
  })

  router.get('/top_posters', async (req, res) => {
    const query = await ctx.db
      .selectFrom('derived_data')
      .select(['data', 'updatedAt'])
      .where('name', '=', 'top_posters')
      .executeTakeFirst()

    return res.render('topPosters', { query: query })
  })

  router.get('/top_followed', async (req, res) => {
    const query = await ctx.db
      .selectFrom('derived_data')
      .select(['data', 'updatedAt'])
      .where('name', '=', 'top_follows')
      .executeTakeFirst()

    return res.render('topFollows', { query: query })
  })

  router.get('/top_blocked', async (req, res) => {
    const query = await ctx.db
      .selectFrom('derived_data')
      .select(['data', 'updatedAt'])
      .where('name', '=', 'top_blocks')
      .executeTakeFirst()

    return res.render('topBlocks', { query: query })
  })

  return router
}
