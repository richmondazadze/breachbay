/** Explicit configuration only; stored human/service classification is immutable. */
export function bootstrapPolicy(subject: string, commanderSubjects: string, serviceSubjects: string, existing?: {service:boolean;platformAdmin:boolean;status:string}) {
 const listed=(value:string)=>value.split(",").map(s=>s.trim()).filter(Boolean).includes(subject);
 const commander=listed(commanderSubjects),service=listed(serviceSubjects);
 if (commander && service || existing && existing.service!==service) throw new Error("IDENTITY_ROLE_CONFLICT");
 return {service,promote:commander && !service && (!existing || existing.status==="ACTIVE" && !existing.platformAdmin)};
}
