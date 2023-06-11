import express from 'express'
import { AppContext } from '../config'

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.redirect('https://bsky.app/profile/wolfgang.raios.xyz');
  })

  return router
}
