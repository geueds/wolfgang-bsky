import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

const maybeStr = (val?: string | any) => {
    if (!val) return undefined
    return val
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.redirect('https://bsky.app/profile/wolfgang.raios.xyz');
  })

  router.get('/blocks', async (req, res) => {
    const handle = maybeStr(req.query.handle)

    let userFound = false
    let textVal = ''
    let blocks = {}

    if (handle && handle.length > 0) {
      const user = await ctx.db
      .selectFrom('profiles')
      .select('did')
      .where('handle', '=', handle)
      .limit(1)
      .executeTakeFirst()

      if (!!user) {
        userFound = true
        textVal = ''

        blocks = await ctx.db
        .selectFrom('blocks')
        .innerJoin('profiles', 'profiles.did', 'blocks.author')
        .select(['did', 'handle', 'displayName', 'blocks.indexedAt'])
        .where('subject', '=', user.did)
        .execute()
      } else {
        userFound = false
        textVal = 'User not found.'
      }
    }

    return res.render('blocks', { handle: handle, userFound: userFound, textVal: textVal, blocks: blocks });
  })

  return router
}
