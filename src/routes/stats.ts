import express from 'express'
import { AppContext } from '../config'
import { getStoredHistogram } from '../derived_data'

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    const profiles = await getStoredHistogram(ctx, 'profiles')
    const posts = await getStoredHistogram(ctx, 'posts')
    const likes = await getStoredHistogram(ctx, 'likes')
    const follows = await getStoredHistogram(ctx, 'follows')
    const blocks = await getStoredHistogram(ctx, 'blocks')
    return res.render('stats', {
      profiles: profiles,
      posts: posts,
      likes: likes,
      follows: follows,
      blocks: blocks,
    })
  })

  return router
}
