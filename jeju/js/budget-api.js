import { authSdk, TEACHER_EMAIL } from "./live.js";

export { TEACHER_EMAIL };
let firebase;
export async function connect(onUser) {
  firebase = await authSdk();
  return firebase.Au.onAuthStateChanged(firebase.auth, onUser);
}
export const currentUser = () => firebase?.auth.currentUser;
export const isOwner = () => currentUser()?.email === TEACHER_EMAIL;
export async function login(email, password) {
  await firebase.Au.signInWithEmailAndPassword(firebase.auth, email.trim(), password);
}
export async function register(email, password) {
  const { user } = await firebase.Au.createUserWithEmailAndPassword(firebase.auth, email.trim(), password);
  await firebase.Au.sendEmailVerification(user);
}
export async function verifyEmail() {
  await firebase.Au.sendEmailVerification(currentUser());
}
export async function refreshUser() {
  await firebase.Au.reload(currentUser());
  await currentUser().getIdToken(true);
}
export async function logout() { await firebase.Au.signOut(firebase.auth); }

// 예산은 서비스워커·localStorage·Firebase의 오프라인 저장본에 넣지 않습니다.
// REST ETag로 두 기기의 동시 수정이 서로 덮어써지는 것을 막습니다.
async function request(path, method = "GET", data, etag) {
  const user = currentUser();
  if (!user) throw new Error("로그인해 주세요.");
  const token = await user.getIdToken();
  const emu = firebase.emulator?.db;
  const base = emu ? `http://${emu}` : firebase.app.options.databaseURL;
  const url = new URL(`${base}/jeju/${path}.json`);
  url.searchParams.set("auth", token);
  if (emu) url.searchParams.set("ns", new URL(firebase.app.options.databaseURL).hostname.split(".")[0]);
  const headers = { "Content-Type": "application/json", "X-Firebase-ETag": "true" };
  if (etag) headers["if-match"] = etag;
  let response;
  try {
    response = await fetch(url, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), cache: "no-store", signal: AbortSignal.timeout(12000) });
  } catch (_) { throw new Error("인터넷 연결을 확인해 주세요."); }
  if (currentUser()?.uid !== user.uid) throw new Error("다시 로그인해 주세요.");
  if (response.status === 412) throw new Error("다른 기기에서 수정했어요. 새로고침 후 다시 입력해 주세요.");
  if (response.status === 401 || response.status === 403) throw new Error("예산 접근 권한이 없어요.");
  if (!response.ok) throw new Error("예산을 불러오거나 저장하지 못했어요.");
  return { data: await response.json(), etag: response.headers.get("etag") };
}
export async function loadBudget() {
  const result = await request("budget");
  if (result.data) {
    result.data.pending ||= "";
    result.data.excluded ||= "";
    Object.values(result.data.items || {}).forEach((item) => { item.note ||= ""; item.spent ??= null; });
  }
  return result;
}
export async function saveBudget(data, etag) {
  if (!etag) throw new Error("새로고침 후 다시 저장해 주세요.");
  return request("budget", "PUT", { ...data, updatedAt: { ".sv": "timestamp" }, updatedBy: currentUser().uid }, etag);
}
export async function loadAccess() { return (await request("budgetAccess")).data?.editorEmail || ""; }
export async function saveAccess(email) {
  if (!isOwner()) throw new Error("선생님만 변경할 수 있어요.");
  const value = email.trim().toLowerCase();
  return request("budgetAccess", value ? "PUT" : "DELETE", value ? { editorEmail: value } : undefined);
}
export function errorText(error) {
  const code = error?.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "이메일과 비밀번호를 확인해 주세요.";
  if (/email-already-in-use/.test(code)) return "가입된 이메일이에요. 로그인해 주세요.";
  if (/invalid-email/.test(code)) return "이메일 주소를 확인해 주세요.";
  if (/weak-password/.test(code)) return "비밀번호는 6자 이상으로 입력해 주세요.";
  if (/too-many-requests/.test(code)) return "잠시 후 다시 시도해 주세요.";
  if (/network/.test(code)) return "인터넷 연결을 확인해 주세요.";
  if (code) return "요청을 처리하지 못했어요. 다시 시도해 주세요.";
  return error?.message || "다시 시도해 주세요.";
}
