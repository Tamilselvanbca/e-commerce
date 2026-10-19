import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { listOrders } from '../../services/orders.js';

const router = Router();

/** UTC offset of `timeZone` at `date`, in minutes (330 for Asia/Kolkata). */
function offsetMinutes(timeZone, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** "+05:30" style offset for MySQL CONVERT_TZ (works without the server's time zone tables). */
const offsetSql = (minutes) =>
  `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;

router.get('/', async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }), req.query);

  // Range = the last `days` calendar days in the store's timezone, including today.
  // (Uses today's UTC offset; exact for zones without daylight saving, such as India.)
  const now = new Date();
  const offset = offsetMinutes(config.store.timezone, now);
  const local = new Date(now.getTime() + offset * 60_000);
  const localMidnight = (daysBack) =>
    new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack) - offset * 60_000);
  const fromTs = localMidnight(days - 1);
  const prevFromTs = localMidnight(2 * days - 1);
  const toTs = now;
  const tz = offsetSql(offset);

  const [totals, previous, newCustomers, pending, byDayRows, byStatus, topProducts, lowStock, gatewaySplit, recent] = await Promise.all([
    queryOne(
      `SELECT coalesce(sum(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS revenue,
              count(*) AS orders,
              count(CASE WHEN payment_status = 'paid' THEN 1 END) AS paid_orders
         FROM orders WHERE created_at >= $1 AND created_at <= $2`,
      [fromTs, toTs],
    ),
    queryOne(
      `SELECT coalesce(sum(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS revenue,
              count(CASE WHEN payment_status = 'paid' THEN 1 END) AS orders
         FROM orders WHERE created_at >= $1 AND created_at < $2`,
      [prevFromTs, fromTs],
    ),
    queryOne(`SELECT count(*) AS count FROM users WHERE role = 'customer' AND created_at >= $1`, [fromTs]),
    queryOne(`SELECT count(*) AS count FROM orders WHERE status IN ('confirmed', 'processing')`),
    query(
      `SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', $3), '%Y-%m-%d') AS day,
              coalesce(sum(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS revenue,
              count(*) AS orders
         FROM orders WHERE created_at >= $1 AND created_at <= $2
        GROUP BY day ORDER BY day`,
      [fromTs, toTs, tz],
    ),
    query(
      `SELECT status, count(*) AS count FROM orders WHERE created_at >= $1 GROUP BY status ORDER BY count DESC`,
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

  // One entry per calendar day, including days without orders.
  const byDate = new Map(byDayRows.map((r) => [r.day, r]));
  const revenueByDay = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (days - 1 - i)))
      .toISOString()
      .slice(0, 10);
    const row = byDate.get(date);
    return { date, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
  });

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
    revenueByDay,
    ordersByStatus: byStatus,
    topProducts,
    lowStock,
    recentOrders: recent.items,
    gatewaySplit,
  });
});

export default router;
