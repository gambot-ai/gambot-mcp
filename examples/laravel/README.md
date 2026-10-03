# Laravel / PHP

1. `.env`:
   ```
   GAMBOT_TOKEN=gmbt_...
   GAMBOT_WEBHOOK_SECRET=<long random string>
   ```
2. `config/services.php`:
   ```php
   'gambot' => ['token' => env('GAMBOT_TOKEN'), 'webhook_secret' => env('GAMBOT_WEBHOOK_SECRET')],
   ```
3. Copy [`Whatsapp.php`](Whatsapp.php) to `app/Services/` and [`WhatsappWebhookController.php`](WhatsappWebhookController.php) to `app/Http/Controllers/`.
4. `routes/api.php` (API routes are CSRF-exempt):
   ```php
   Route::post('/whatsapp/webhook', [\App\Http\Controllers\WhatsappWebhookController::class, 'handle']);
   ```
5. Register the public URL once with `POST /webhooks/forward` (see `../README.md`).
6. Use it:
   ```php
   $wa = app(\App\Services\Whatsapp::class);
   $sent = $wa->send('12025550123', 'Your order shipped', 'order_update_0626', ['Dana', '#1234']);
   $status = $wa->status($sent['messageId'], '12025550123');
   ```
