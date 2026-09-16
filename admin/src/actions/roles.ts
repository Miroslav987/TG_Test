"use server";
import { prisma } from "@standup/shared";
import { revalidatePath } from "next/cache";

export async function createRole(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name) return;
  await prisma.role.create({ data: { name } });
  revalidatePath("/roles");
}

export async function updateRole(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  if (id && name) await prisma.role.update({ where: { id }, data: { name } });
  revalidatePath("/roles");
}

export async function deleteRole(formData: FormData) {
  const id = formData.get("id") as string;
  if (id) await prisma.role.delete({ where: { id } });
  revalidatePath("/roles");
}