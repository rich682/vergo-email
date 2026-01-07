import { redirect } from "next/navigation";
import { debugLog } from "@/lib/debug-logger";

export default function Home() {
  // #region agent log
  debugLog({location:'app/page.tsx:5',message:'Home: redirecting to /dashboard/inbox',data:{},hypothesisId:'D'})
  // #endregion
  redirect("/dashboard/inbox");
}

