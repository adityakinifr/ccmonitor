import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  getWhatsAppStatus,
  initWhatsApp,
  updateWhatsAppConfig,
  getWhatsAppPending,
  resolveWhatsAppApproval,
} from '@/utils/api';
import type { WhatsAppStatus, WhatsAppPendingApproval } from '@/types';

export function WhatsAppSettings() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [pending, setPending] = useState<WhatsAppPendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);

  const loadStatus = useCallback(async () => {
    try {
      const [statusData, pendingData] = await Promise.all([
        getWhatsAppStatus(),
        getWhatsAppPending(),
      ]);
      setStatus(statusData);
      setPending(pendingData.pending);

      if (statusData.config.targetNumber) {
        setPhoneNumber(statusData.config.targetNumber);
      }
      setTimeoutMinutes(Math.floor(statusData.config.timeoutMs / 60000));
    } catch (error) {
      console.error('Failed to load WhatsApp status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    // Poll for status updates
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleInit = async () => {
    setInitializing(true);
    try {
      await initWhatsApp();
      // Start polling more frequently for QR code
      const pollInterval = setInterval(loadStatus, 1000);
      setTimeout(() => clearInterval(pollInterval), 60000); // Stop after 1 minute
    } catch (error) {
      console.error('Failed to initialize WhatsApp:', error);
    } finally {
      setInitializing(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await updateWhatsAppConfig({ enabled });
      await loadStatus();
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await updateWhatsAppConfig({
        targetNumber: phoneNumber || null,
        timeoutMs: timeoutMinutes * 60000,
      });
      await loadStatus();
    } catch (error) {
      console.error('Failed to update config:', error);
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
              <CardTitle className="text-sm font-medium">WhatsApp Approvals</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get approval requests on your phone
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.ready ? (
              <Badge className="bg-green-500/15 text-green-600 border-green-500/30">
                Connected
              </Badge>
            ) : status?.initialized ? (
              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                Connecting...
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not Connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code display */}
        {status?.qrCode && (
          <div className="rounded-lg border border-border bg-white p-4 text-center">
            <p className="text-sm text-gray-600 mb-3">
              Scan this QR code with WhatsApp:
            </p>
            <div className="inline-block p-3 bg-white rounded-lg">
              <QRCodeSVG
                value={status.qrCode}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-gray-500 mt-3">
              WhatsApp → Settings → Linked Devices → Link a Device
            </p>
          </div>
        )}

        {/* Not initialized - show init button */}
        {!status?.initialized && (
          <div className="flex flex-col items-center py-4 gap-3">
            <p className="text-sm text-muted-foreground text-center">
              Connect WhatsApp to receive approval requests on your phone
            </p>
            <Button onClick={handleInit} disabled={initializing}>
              {initializing ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Initializing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Connect WhatsApp
                </>
              )}
            </Button>
          </div>
        )}

        {/* Configuration - show when connected */}
        {status?.ready && (
          <>
            {/* Enable toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Enable WhatsApp Approvals</p>
                <p className="text-xs text-muted-foreground">
                  Proxy unmatched tool calls to WhatsApp
                </p>
              </div>
              <Switch
                checked={status.config.enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>

            {/* Phone number */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="+1234567890"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={handleSaveConfig}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Include country code (e.g., +1 for US)
              </p>
            </div>

            {/* Timeout */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Timeout (minutes)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(parseInt(e.target.value) || 5)}
                  className="w-24 h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={handleSaveConfig}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-deny after this many minutes with no response
              </p>
            </div>

            {/* Pending approvals */}
            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pending Approvals ({pending.length})</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {pending.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border/50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-medium text-sm">[{p.id}] {p.toolName}</span>
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
                          onClick={async () => {
                            try {
                              await resolveWhatsAppApproval(p.id, 'allow');
                              await loadStatus();
                            } catch (error) {
                              console.error('Failed to approve:', error);
                            }
                          }}
                        >
                          Allow
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={async () => {
                            try {
                              await resolveWhatsAppApproval(p.id, 'deny');
                              await loadStatus();
                            } catch (error) {
                              console.error('Failed to deny:', error);
                            }
                          }}
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
