import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import rateLimit from 'express-rate-limit'
import * as dData from '../derived_data'

const maybeStr = (val?: string | any) => {
  if (!val) return undefined
  return val
}

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

  const blocksLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  })

  router.get('/', async (req, res) => {
    return res.render('index')
  })

  router.get('/blocks', async (req, res) => {
    return res.render('blocks')
  })

  router.post('/blocks', blocksLimit, async (req, res) => {
    const timeStart = Date.now()
    const intType = maybeStr(req.body.submit) ?? undefined
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim() ?? ''

    if (!intType || handle.length === 0) {
      return res.render('blocks')
    }

    const db_profile = await getProfile(ctx, handle)
    if (!db_profile) {
        return res.render('blocks', { handle: handle, errorText: `User not found: @${handle}`})
    }

    const query = await ctx.db
      .selectFrom('blocks')
      .innerJoin('profiles', 'profiles.did', 'blocks.author')
      .select(['did', 'handle', 'displayName', 'avatar', 'blocks.indexedAt'])
      .where('subject', '=', db_profile.did)
      .orderBy('indexedAt', 'desc')
      .execute()

    ctx.log(`[blocks] Searched blocks of @${db_profile.handle} [${db_profile.did}] [${(Date.now() - timeStart) / 1000}s]`)
    return res.render('blocks', {
      handle: handle,
      profile: db_profile,
      query: query,
    })
  })

  router.get('/update/:name/:value?', async (req, res) => {
    ctx.log(
      `[data] request @ /update/${req.params.name}/${req.params.value} from ${req.ip}`,
    )
    if (!['127.0.0.1', '::1'].includes(req.ip)) {
      res.end()
    }

    if (req.params.name === 'follows') {
      await dData.updateTopFollowed(ctx)
      res.send('done!')
    }

    if (req.params.name === 'blocks') {
      await dData.updateTopBlocked(ctx)
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
