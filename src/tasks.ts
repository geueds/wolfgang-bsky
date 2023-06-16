var cron = require('node-cron');
import { AppContext } from './config'
import * as dData from './derived_data'

const scheduledTasks = async (ctx: AppContext) => {
    cron.schedule("0 * * * *", async () => {
        ctx.log('Updating top blocked')
        dData.updateTopBlocked(ctx)
    });

    cron.schedule("30 * * * *", async () => {
        ctx.log('Updating top followed')
        dData.updateTopFollowed(ctx)
    });

    cron.schedule("*/5 * * * * ", async () => {
        ctx.log('Updating Wolfgang followers')
        ctx.followers = await dData.updateLickablePeople(ctx)
    })
}

export default scheduledTasks
