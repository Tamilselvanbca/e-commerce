import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { listOrders } from '../../services/orders.js';

const router = Router();

router.get('/', async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }), req.query);
  const tz = config.store.timezone;

  // Range = the last `days` calendar days in the store's timezone, including today.
  const range = await queryOne(
    `SELECT (date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => $2 - 1)) AT TIME ZONE $1 AS from_ts,
            now() AS to_ts,
            (date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => 2 * $2 - 1)) AT TIME ZONE $1 AS prev_from_ts`,
    [tz, days],
  );
  const { fromTs, toTs, prevFromTs } = range;

  const [totals, previous, newCustomers, pending, byDay, byStatus, topProducts, lowStock, gatewaySplit, recent] = await Promise.all([
    queryOne(
      `SELECT coalesce(sum(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue,
              count(*) AS orders,
              count(*) FILTER (WHERE payment_status = 'paid') AS paid_orders
         FROM orders WHERE created_at >= $1 AND created_at <= $2`,
      [fromTs, toTs],
    ),
    queryOne(
      `SELECT coalesce(sum(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue,
              count(*) FILTER (WHERE payment_status = 'paid') AS orders
         FROM orders WHERE created_at >= $1 AND created_at < $2`,
      [prevFromTs, fromTs],
    ),
    queryOne(`SELECT count(*) FROM users WHERE role = 'customer' AND created_at >= $1`, [fromTs]),
    queryOne(`SELECT count(*) FROM orders WHERE status IN ('confirmed', 'processing')`),
    query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              coalesce(sum(o.total) FILTER (WHERE o.payment_status = 'paid'), 0) AS revenue,
              count(o.id) AS orders
         FROM generate_series(($1::timestamptz AT TIME ZONE $3)::date, ($2::timestamptz AT TIME ZONE $3)::date, interval '1 day') AS d(day)
         LEFT JOIN orders o ON (o.created_at AT TIME ZONE $3)::date = d.day::date
        GROUP BY d.day ORDER BY d.day`,
      [fromTs, toTs, tz],
    ),
    query(
      `SELECT status, count(*) FROM orders WHERE created_at >= $1 GROUP BY status ORDER BY count(*) DESC`,
      [fromTs],
    ),
    query(
      `SELECT oi.product_id, max(oi.product_name) AS name, sum(oi.quantity) AS quantity, sum(oi.line_total) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid' AND o.created_at >= $1
        GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 5`,
      [fromTs],
    ),
    query(
      `SELECT v.id AS variant_id, p.id AS product_id, p.name AS product_name, v.sku, v.size, v.color, v.stock
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.is_active AND p.status = 'active' AND v.stock <= $1
        ORDER BY v.stock, p.name LIMIT 10`,
      [config.store.lowStockThreshold],
    ),
    query(
      `SELECT payment_gateway AS gateway, count(*) AS orders, sum(total) AS revenue
         FROM orders WHERE payment_status = 'paid' AND created_at >= $1 AND payment_gateway IS NOT NULL
        GROUP BY payment_gateway ORDER BY revenue DESC`,
      [fromTs],
    ),
    listOrders({ page: 1, pageSize: 8, admin: true }),
  ]);

  res.json({
    range: { from: fromTs, to: toTs, days },
    totals: {
      revenue: totals.revenue,
      orders: totals.orders,
      paidOrders: totals.paidOrders,
      avgOrderValue: totals.paidOrders ? Math.round(totals.revenue / totals.paidOrders) : 0,
      newCustomers: newCustomers.count,
      pendingFulfilment: pending.count,
      previousRevenue: previous.revenue,
      previousOrders: previous.orders,
    },
    revenueByDay: byDay,
    ordersByStatus: byStatus,
    topProducts,
    lowStock,
    recentOrders: recent.items,
    gatewaySplit,
  });
});

export default router;
