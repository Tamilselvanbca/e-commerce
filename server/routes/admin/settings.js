import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { sendTestEmail } from '../../services/email.js';
import { describeSettings, saveSettings } from '../../services/settings.js';
import { listVerifyTemplates } from '../../services/sms.js';

const router = Router();

router.get('/settings', (req, res) => {
  res.json(describeSettings());
});

router.put('/settings', async (req, res) => {
  const { values } = parse(
    z.object({
      values: z.record(z.string().regex(/^[A-Z0-9_]+$/, 'Unknown setting'), z.string().max(4000).nullable()),
    }),
    req.body,
  );
  res.json(await saveSettings(values, req.user.id));
});

router.post('/settings/test-email', async (req, res) => {
  const { to } = parse(z.object({ to: z.email('Enter a valid email address') }), req.body);
  await sendTestEmail(to);
  res.json({ sent: true, to });
});

router.get('/settings/twilio-verify-templates', async (req, res) => {
  res.json({ items: await listVerifyTemplates() });
});

export default router;
