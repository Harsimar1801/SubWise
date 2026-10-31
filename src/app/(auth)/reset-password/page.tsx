import { AuthForm } from "@/features/auth/auth-form";
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}) { const {token}=await searchParams; return <AuthForm mode="reset" token={token}/>; }
