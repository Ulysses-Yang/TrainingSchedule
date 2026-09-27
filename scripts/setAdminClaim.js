// scripts/setAdminClaim.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function addAdmin(uid) {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  await db.collection('admins').doc(uid).set({
    active: true, // 關鍵：Functions 會 where('active','==', true)
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Added admin: ${uid}`);
}

async function removeAdmin(uid) {
  await admin.auth().setCustomUserClaims(uid, { admin: false }); // 顯式清掉
  // 你可選擇刪除，或改成 inactive（看團隊偏好）
  await db.collection('admins').doc(uid).delete().catch(() => {});
  console.log(`Removed admin: ${uid}`);
}

(async () => {
  const [cmd, uid] = process.argv.slice(2);
  if (!cmd || !uid) {
    console.log('用法: node scripts/setAdminClaim.js add <UID> | remove <UID>');
    process.exit(1);
  }
  if (cmd === 'add') await addAdmin(uid);
  else if (cmd === 'remove') await removeAdmin(uid);
  else console.log('指令必須是 add 或 remove');
})();