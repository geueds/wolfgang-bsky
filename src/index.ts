import dotenv from 'dotenv'
import Wolfgang from './server'

const run = async () => {
  dotenv.config()
  const server = Wolfgang.create({
    bskyIdentifier: maybeStr(process.env.FEEDGEN_BSKY_IDENTIFIER) ?? '',
    bskyPassword: maybeStr(process.env.FEEDGEN_BSKY_PASSWORD) ?? '',
    mysqlDatabase: maybeStr(process.env.FEEDGEN_MYSQL_DATABASE) ?? 'bsky',
    mysqlHost: maybeStr(process.env.FEEDGEN_MYSQL_HOST) ?? 'localhost',
    mysqlUser: maybeStr(process.env.FEEDGEN_MYSQL_USER) ?? '',
    mysqlPassword: maybeStr(process.env.FEEDGEN_MYSQL_PASSWORD) ?? '',
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.social',
  })
  await server.start()
  console.log(
    `running Wolfgang app`,
  )
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
