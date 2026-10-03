<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Official WhatsApp Business API through Gambot.
 * Free text only works inside the 24-hour window; outside it an approved template is required.
 */
class Whatsapp
{
    private function http()
    {
        return Http::withToken(config('services.gambot.token'))
            ->baseUrl('https://api.gambot.co.il/api/v1')
            ->acceptJson()
            ->timeout(15);
    }

    public function windowOpen(string $to): bool
    {
        return (bool) $this->http()->get("/conversations/{$to}/window")->throw()->json('data.windowOpen');
    }

    public function sendText(string $to, string $text): array
    {
        return $this->http()->post('/messages/send-text', ['to' => $to, 'text' => $text])->throw()->json('data');
    }

    public function sendTemplate(string $to, string $templateId, array $variables = []): array
    {
        return $this->http()->post('/messages/send-template', [
            'to' => $to, 'templateId' => $templateId, 'variables' => $variables,
        ])->throw()->json('data');
    }

    /** Text if the window is open, otherwise the approved template. */
    public function send(string $to, string $text, string $templateId, array $variables = []): array
    {
        return $this->windowOpen($to) ? $this->sendText($to, $text) : $this->sendTemplate($to, $templateId, $variables);
    }

    public function status(string $messageId, string $phone): array
    {
        return $this->http()->get('/messages/' . rawurlencode($messageId) . '/status', ['phone' => $phone])->throw()->json('data');
    }
}
