import type { Metadata } from "next";
import { safeDecode } from "@/components/shop/utils";
import { OrderDetail } from "./order-detail";

export async function generateMetadata(props: PageProps<"/account/orders/[orderNumber]">): Promise<Metadata> {
  const { orderNumber } = await props.params;
  return { title: `Order ${safeDecode(orderNumber)}` };
}

export default async function OrderPage(props: PageProps<"/account/orders/[orderNumber]">) {
  const orderNumber = safeDecode((await props.params).orderNumber);
  return <OrderDetail key={orderNumber} orderNumber={orderNumber} />;
}
