import type { Metadata } from "next";
import { ProfileSection } from "./profile-form";

export const metadata: Metadata = { title: "My account" };

export default function AccountPage() {
  return <ProfileSection />;
}
