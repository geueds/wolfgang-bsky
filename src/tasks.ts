var cron = require('node-cron')
import { AppContext } from './config'
import * as dData from './derived_data'

export const clearDb = async (ctx: AppContext) => {
  const query = await ctx.db
  .selectFrom('profiles')
  .select('did')
  .where('updatedAt', '<', new Date(Date.now() - 3 * 7 * 24 * 3600 * 1000).toISOString())
  .orderBy('updatedAt', 'asc')
  .limit(300)
  .execute()

  for (const did of query.map(x => x.did)) {
    await ctx.api.getProfile({
      actor: did
    })
    .then(res => {
      if (res.success) {
        ctx.db
        .updateTable('profiles')
        .set({
          handle: res.data.handle,
          displayName: res.data.displayName,
          avatar: res.data.avatar ?? null,
          description: res.data.description,
          indexedAt: res.data.indexedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where('did', '=', did)
        .execute()
      }
    })
    .catch(e => {
      if (e.message === 'Profile not found') {
        ctx.log(`[clean_db] Removing profile: ${did}`)

        ctx.db
        .deleteFrom('profiles')
        .where('did', '=', did)
        .execute()

        ctx.db
        .deleteFrom('circles')
        .where('did', '=', did)
        .execute()
      
        ctx.db
        .deleteFrom('posts')
        .where('author', '=', did)
        .execute()

        ctx.db
        .deleteFrom('blocks')
        .where(({or, cmpr}) => or([
          cmpr('author', '=', did),
          cmpr('subject', '=', did)
        ]))
        .execute()

        ctx.db
        .deleteFrom('follows')
        .where(({or, cmpr}) => or([
          cmpr('author', '=', did),
          cmpr('subject', '=', did)
        ]))
        .execute()

        ctx.db
        .deleteFrom('likes')
        .where('uri', 'like', `at://${did}%`)
        .execute()

        ctx.db
        .deleteFrom('reposts')
        .where('uri', 'like', `at://${did}%`)
        .execute()
      }
    })
  }
}

const scheduledTasks = async (ctx: AppContext) => {
  cron.schedule('*/2 * * * *', async () => {
    const timeStart = Date.now()
    await clearDb(ctx)
    ctx.log(
      `[clean_db] Done in ${(Date.now() - timeStart) / 1000}s`,
    )
  })

  cron.schedule('0 * * * *', async () => {
    const timeStart = Date.now()
    await dData.updateTopBlocked(ctx)
    ctx.log(
      `[data] Updated top blocked in ${(Date.now() - timeStart) / 1000}s`,
    )
  })

  cron.schedule('30 * * * *', async () => {
    const timeStart = Date.now()
    await dData.updateTopFollowed(ctx)
    ctx.log(
      `[data] Updated top followed in ${(Date.now() - timeStart) / 1000}s`,
    )
  })

  cron.schedule('*/5 * * * * ', async () => {
    const timeStartA = Date.now()
    ctx.followers = await dData.updateLickablePeople(ctx)
    ctx.log(
      `[wolfgang] updated my followers in ${
        (Date.now() - timeStartA) / 1000
      }s`,
    )

    const timeStartB = Date.now()
    await dData.updateLickablePosts(ctx)
    ctx.log(
      `[wolfgang] searched for new posts to repost in ${
        (Date.now() - timeStartB) / 1000
      }s`,
    )
  })
}

export default scheduledTasks
