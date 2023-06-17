var cron = require('node-cron');
import { AppContext } from './config'
import * as dData from './derived_data'

const scheduledTasks = async (ctx: AppContext) => {

    if (!ctx.cfg.devel) {
        cron.schedule("0 * * * *", async () => {
            const timeStart = Date.now()
            await dData.updateTopBlocked(ctx)
            ctx.log(`Updated top blocked in ${(Date.now() - timeStart)/1000}s`)
        });

        cron.schedule("30 * * * *", async () => {
            const timeStart = Date.now()
            await dData.updateTopFollowed(ctx)
            ctx.log(`Updated top followed in ${(Date.now() - timeStart)/1000}s`)
        });

        cron.schedule("*/5 * * * * ", async () => {
            const timeStartA = Date.now()
            ctx.followers = await dData.updateLickablePeople(ctx)
            ctx.log(`Updated bot followers in ${(Date.now() - timeStartA)/1000}s`)
    
            const timeStartB = Date.now()
            await dData.updateLickablePosts(ctx)
            ctx.log(`Searched for new posts in ${(Date.now() - timeStartB)/1000}s`)
        })
    }
}

export default scheduledTasks
