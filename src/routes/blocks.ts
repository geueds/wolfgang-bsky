import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import rateLimit from 'express-rate-limit'
import { getProfile } from './index'
import { maybeStr } from '../index'

export default function (ctx: AppContext) {
  const router = express.Router()

  const blocksLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
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

  return router
}
