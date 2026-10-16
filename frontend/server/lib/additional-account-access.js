// Entitlements are read with the authenticated user's RLS scope, never browser metadata.
export async function additionalAccountAccess(client, professional, environment = process.env.VERCEL_ENV) {
 const {data: assignment,error} = await client.from("pro_account_assignments").select("user_id").eq("company_id",professional.companyId).eq("user_id",professional.userId).maybeSingle();
 if(error) throw new Error("Additional account lookup unavailable");
 if(!assignment)return {additionalAccount:false};
 const {data: paid,error: paymentError}=await client.from("pro_additional_accounts").select("quantity,paid_until,billing_environment").eq("company_id",professional.companyId).maybeSingle();
 const {data: assignments,error: assignmentsError}=await client.from("pro_account_assignments").select("user_id,assigned_at").eq("company_id",professional.companyId).order("assigned_at").order("user_id");
 if(paymentError || assignmentsError)throw new Error("Additional account capacity unavailable");
 const position=assignments.findIndex(row=>row.user_id===professional.userId);
 if(!paid || paid.billing_environment!==environment || Date.parse(paid.paid_until)<=Date.now() || !Number.isFinite(Date.parse(paid.paid_until)) || position<0 || position>=paid.quantity) return {additionalAccount:true,expired:true};
 return {additionalAccount:true};
}
