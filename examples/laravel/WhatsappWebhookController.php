<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsappWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $expected = 'Bearer ' . config('services.gambot.webhook_secret');
        abort_unless(
            config('services.gambot.webhook_secret') && hash_equals($expected, (string) $request->header('Authorization')),
            401
        );

        $event = $request->all();
        $value = data_get($event, 'meta_obj.entry.0.changes.0.value');

        if (($event['type'] ?? null) === 'incoming_message' && ($msg = data_get($value, 'messages.0'))) {
            // Dispatch a queued job; dedupe on $msg['id']. The 24h window is now open: you can reply with free text.
            Log::info('whatsapp message', ['from' => $msg['from'] ?? null, 'type' => $msg['type'] ?? null]);
        } elseif (($event['type'] ?? null) === 'message_status' && ($st = data_get($value, 'statuses.0'))) {
            Log::info('whatsapp status', ['id' => $st['id'] ?? null, 'status' => $st['status'] ?? null]);
        }

        return response('ok'); // acknowledge fast
    }
}
