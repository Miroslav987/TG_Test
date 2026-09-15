"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createRole(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name) return;
  
  await prisma.role.create({ data: { name } });
  revalidatePath("/roles");
}