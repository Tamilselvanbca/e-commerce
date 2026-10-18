import type { Metadata } from "next";
import { AddressesView } from "./addresses-view";

export const metadata: Metadata = { title: "My addresses" };

export default function AddressesPage() {
  return <AddressesView />;
}
