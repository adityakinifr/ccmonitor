import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  getWhatsAppBusinessStatus,
  updateWhatsAppBusinessConfig,
  getWhatsAppBusinessPending,
  resolveWhatsAppBusinessApproval,
  getWhatsAppBusinessSetup,
} from '@/utils/api';
import type { WhatsAppBusinessStatus, WhatsAppPendingApproval, WhatsAppBusinessSetup } from '@/types';

export function WhatsAppBusinessSettings() {
  const [status, setStatus] = useState<WhatsAppBusinessStatus | null>(null);
  const [pending, setPending] = useState<WhatsAppPendingApproval[]>([]);
  const [setup, setSetup] = useState<WhatsAppBusinessSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  // Form fields
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [targetNumber, setTargetNumber] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [statusData, pendingData] = await Promise.all([
        getWhatsAppBusinessStatus(),
        getWhatsAppBusinessPending(),
      ]);
      setStatus(statusData);
      setPending(pendingData.pending);

      // Load form values from status
      if (statusData.config.phoneNumberId) {
        setPhoneNumberId(statusData.config.phoneNumberId);
      }
      if (statusData.config.targetNumber) {
        setTargetNumber(statusData.config.targetNumber);
      }
      setTimeoutMinutes(Math.floor(statusData.config.timeoutMs / 60000));
    } catch (error) {
      console.error('Failed to load WhatsApp Business status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSetup = useCallback(async () => {
    try {
      const data = await getWhatsAppBusinessSetup();
      setSetup(data);
      setShowSetup(true);
    } catch (error) {
      console.error('Failed to load setup instructions:', error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await updateWhatsAppBusinessConfig({ enabled });
      await loadStatus();
    } catch (error) {
      console.error('Failed to toggle:', error);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await updateWhatsAppBusinessConfig({
        accessToken: accessToken || undefined,
        phoneNumberId,
        targetNumber,
        timeoutMs: timeoutMinutes * 60000,
      });
      setAccessToken(''); // Clear token after save
      await loadStatus();
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApproval = async (id: string, decision: 'allow' | 'deny') => {
    try {
      await resolveWhatsAppBusinessApproval(id, decision);
      await loadStatus();
    } catch (error) {
      console.error('Failed to resolve approval:', error);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-6 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <CardTitle className="text-sm font-medium">WhatsApp Business API</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Interactive buttons for approvals
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.configured && status?.enabled ? (
              <Badge className="bg-green-500/15 text-green-600 border-green-500/30">
                Active
              </Badge>
            ) : status?.configured ? (
              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                Configured (Disabled)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not Configured
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Setup Instructions */}
        {showSetup && setup && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Setup Instructions</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowSetup(false)}>
                Close
              </Button>
            </div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              {setup.instructions.map((instruction, i) => (
                <li key={i}>{instruction}</li>
              ))}
            </ol>
            {setup.notes && setup.notes.length > 0 && (
              <div className="mt-3 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                <p className="text-xs font-medium text-amber-600 mb-1">Important Notes:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  {setup.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-2 mt-4">
              <div>
                <label className="text-xs font-medium">Webhook URL</label>
                <code className="block text-xs bg-background p-2 rounded mt-1 break-all">
                  {setup.webhookUrl}
                </code>
              </div>
              <div>
                <label className="text-xs font-medium">Verify Token</label>
                <code className="block text-xs bg-background p-2 rounded mt-1 font-mono">
                  {setup.verifyToken}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Not configured - show setup */}
        {!status?.configured && !showSetup && (
          <div className="flex flex-col items-center py-4 gap-3">
            <p className="text-sm text-muted-foreground text-center">
              Use Meta's WhatsApp Business API for interactive approval buttons
            </p>
            <Button onClick={loadSetup}>
              View Setup Instructions
            </Button>
          </div>
        )}

        {/* Configuration Form */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Configuration</h4>

          {/* Access Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Access Token</label>
            <input
              type="password"
              placeholder={status?.config.hasAccessToken ? '••••••••••••' : 'Enter access token'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              From Meta Developer Console → WhatsApp → API Setup
            </p>
          </div>

          {/* Phone Number ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Phone Number ID</label>
            <input
              type="text"
              placeholder="123456789012345"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your WhatsApp Business phone number ID
            </p>
          </div>

          {/* Target Number */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Your Phone Number</label>
            <input
              type="tel"
              placeholder="+14155551234"
              value={targetNumber}
              onChange={(e) => setTargetNumber(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Where to send approval requests (include country code)
            </p>
          </div>

          {/* Timeout */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Timeout (minutes)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={timeoutMinutes}
              onChange={(e) => setTimeoutMinutes(parseInt(e.target.value) || 5)}
              className="w-24 h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <Button onClick={handleSaveConfig} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>

        {/* Enable toggle (only show when configured) */}
        {status?.configured && (
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Enable WhatsApp Business</p>
              <p className="text-xs text-muted-foreground">
                Send approval requests with interactive buttons
              </p>
            </div>
            <Switch
              checked={status.enabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>
        )}

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Pending Approvals ({pending.length})</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border/50 p-3 text-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-medium text-sm">#{p.id} {p.toolName}</span>
                    <span className="text-muted-foreground">
                      {Math.floor((Date.now() - p.createdAt) / 1000)}s ago
                    </span>
                  </div>
                  <p className="text-muted-foreground mb-3 line-clamp-2">
                    {p.normalizedText}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleApproval(p.id, 'allow')}
                    >
                      Allow
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleApproval(p.id, 'deny')}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
