import { data } from "react-router";
import * as v from "valibot";
import type { Route } from "./+types/api.notifications";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import {
  markNotificationRead,
  markAllRead,
} from "~/services/notificationService";

const notificationActionSchema = v.variant("intent", [
  v.object({
    intent: v.literal("mark-read"),
    notificationId: v.pipe(
      v.string(),
      v.transform(Number),
      v.number(),
      v.integer()
    ),
  }),
  v.object({ intent: v.literal("mark-all-read") }),
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, notificationActionSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  // Both operations are scoped to the current user, so a user can only ever
  // mark their own notifications read.
  if (parsed.data.intent === "mark-read") {
    markNotificationRead(parsed.data.notificationId, currentUserId);
  } else {
    markAllRead(currentUserId);
  }

  return { success: true };
}
