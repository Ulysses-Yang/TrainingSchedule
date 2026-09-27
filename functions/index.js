// functions/index.js

// 使用 v2 版本的導入，支援 Gen 2
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * @name acceptFriendRequest
 * @description 處理接受好友邀請
 */
exports.acceptFriendRequest = onCall({ region: "asia-east1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const { requestId } = request.data;
  const myUid = request.auth.uid;
  const requestRef = db.collection("friend_requests").doc(requestId);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const requestDoc = await transaction.get(requestRef);
      if (!requestDoc.exists) {
        throw new HttpsError("not-found", "Friend request not found.");
      }
      const requestData = requestDoc.data();
      const requesterUid = requestData.from;
      if (requestData.to !== myUid) {
        throw new HttpsError("permission-denied", "You are not authorized to accept this request.");
      }
      if (requestData.status !== "pending") {
        throw new HttpsError("failed-precondition", "This request has already been handled.");
      }
      const myUserRef = db.collection("users").doc(myUid);
      const requesterUserRef = db.collection("users").doc(requesterUid);
      transaction.update(requestRef, { status: "accepted" });
      transaction.update(myUserRef, { friends: admin.firestore.FieldValue.arrayUnion(requesterUid) });
      transaction.update(requesterUserRef, { friends: admin.firestore.FieldValue.arrayUnion(myUid) });
      return { success: true, message: "Friend request accepted." };
    });
    return result;
  } catch (error) {
    console.error("Transaction failed: ", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "An internal error occurred.", error.message);
  }
});

/**
 * @name declineFriendRequest
 * @description 處理拒絕好友邀請
 */
exports.declineFriendRequest = onCall({ region: "asia-east1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const { requestId } = request.data;
  const myUid = request.auth.uid;
  const requestRef = db.collection("friend_requests").doc(requestId);
  try {
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) {
      throw new HttpsError("not-found", "Friend request not found.");
    }
    const requestData = requestDoc.data();
    if (requestData.to !== myUid) {
      throw new HttpsError("permission-denied", "You are not authorized to decline this request.");
    }
    await requestRef.update({ status: "declined" });
    return { success: true, message: "Friend request declined." };
  } catch (error) {
    console.error("Decline request failed: ", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "An internal error occurred.", error.message);
  }
});

/**
 * @name onCoachApplicationChange
 * @description 監聽教練申請狀態變化：
 * - 送出或變成 pending：只通知 admins 集合中的管理員
 * - 核准或駁回：只通知申請者本人
 */
exports.onCoachApplicationChange = onDocumentWritten(
  { document: "coach_applications/{uid}", region: "asia-east1" },
  async (event) => {
    const applicantUid = event.params.uid;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!after) return; // 刪除不處理

    const prevStatus = before?.status;
    const currStatus = after.status;

    // 工具：為單一使用者建立一筆通知（隨機 ID）
    const addNotification = async (to, type, message, payload = {}, status = "info") => {
      await db.collection("notifications").add({
        to,
        from: "system",
        fromName: "系統",
        type,
        message,
        payload,
        status, // info | success | error 等
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    };

    // 工具：為每位 admin 建立一筆「幂等」通知（固定 ID，重試不重複）
    const fanoutToAdminsIdempotent = async (build) => {
      const adminsSnap = await db.collection("admins").where("active", "==", true).get();
      if (adminsSnap.empty) return;

      const writer = db.bulkWriter();
      adminsSnap.forEach((docSnap) => {
        const adminUid = docSnap.id; // 文件 ID = 管理員 UID
        const { id, data } = build(adminUid);
        const ref = db.collection("notifications").doc(id);
        writer
          .create(ref, data)
          .catch((e) => {
            // 已存在就忽略，達到冪等
            if (e?.code !== 6 && e?.code !== "ALREADY_EXISTS") {
              console.error("admin notification create failed:", e);
            }
          });
      });
      await writer.close();
    };

    // 1) 申請送出（新建即為 pending，或其他狀態 → pending）
    const becamePending =
      (!before && currStatus === "pending") ||
      (before && prevStatus !== "pending" && currStatus === "pending");

    if (becamePending) {
      const msg = `新的教練身分申請：${after.userName || applicantUid}${
        after.orgName ? `（${after.orgName}）` : ""
      }`;
      const payload = {
        applicantId: applicantUid,
        userName: after.userName || "",
        orgName: after.orgName || "",
        status: currStatus,
      };

      await fanoutToAdminsIdempotent((adminUid) => {
        const id = `coach_app_submitted__${applicantUid}__to__${adminUid}`;
        return {
          id,
          data: {
            to: adminUid,
            from: "system",
            fromName: "系統",
            type: "COACH_APPLICATION_SUBMITTED",
            message: msg,
            payload,
            status: "info",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        };
      });
    }

    // 2) 審核通過 → 通知申請者
    const becameApproved = prevStatus !== "approved" && currStatus === "approved";
    if (becameApproved) {
      await addNotification(
        applicantUid,
        "COACH_APPLICATION_APPROVED",
        `您的教練身分申請已通過${after.orgName ? `：${after.orgName}` : ""}`,
        { orgName: after.orgName || "" },
        "success"
      );
    }

    // 3) 駁回 → 通知申請者
    const becameRejected = prevStatus !== "rejected" && currStatus === "rejected";
    if (becameRejected) {
      await addNotification(
        applicantUid,
        "COACH_APPLICATION_REJECTED",
        `您的教練身分申請未通過${after.reason ? `：${after.reason}` : ""}`,
        { orgName: after.orgName || "", reason: after.reason || "" },
        "error"
      );
    }
  }
);