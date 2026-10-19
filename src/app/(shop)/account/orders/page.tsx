import type { Metadata } from "next";
import { pageParam } from "@/components/shop/utils";
import { OrdersList } from "./orders-list";

export const metadata: Metadata = { title: "My orders" };

export default async function OrdersPage(props: PageProps<"/account/orders">) {
  const { page } = await props.searchParams;
  return <OrdersList page={pageParam(page)} />;
}
