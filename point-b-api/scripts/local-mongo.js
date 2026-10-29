// Local single-node MongoDB replica set (Prisma needs a replica set for transactions).
// Data persists in ./.mongo-data. Leave running; Ctrl+C to stop.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const fs = require('fs');
const dbPath = require('path').join(__dirname, '..', '.mongo-data');
fs.mkdirSync(dbPath, { recursive: true });
(async () => {
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', dbName: 'pointb' },
    instanceOpts: [{ port: 27017, dbPath, storageEngine: 'wiredTiger' }],
  });
  console.log('MongoDB ready: ' + rs.getUri('pointb'));
  process.on('SIGINT', async () => { await rs.stop(); process.exit(0); });
})();
