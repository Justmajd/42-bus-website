import db from './server/db.js';
async function test() {
  const ts = await db.execute('SELECT * FROM trips ORDER BY date DESC, time_slot_id ASC;');
  console.log(ts.rows);
}
test();
