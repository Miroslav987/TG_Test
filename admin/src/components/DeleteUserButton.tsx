"use client";

import { deleteUser } from "../actions/users";

export default function DeleteUserButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  return (
    <form
      action={deleteUser}
      className="inline mt-2"
      onSubmit={(e) => {
        if (!confirm(`Точно удалить сотрудника "${userName}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="text-xs text-red-600 hover:underline">
        🗑 Удалить
      </button>
    </form>
  );
}