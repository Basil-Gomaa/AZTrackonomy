import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Bell, Save } from "lucide-react";
import { useNotificationSettings } from "@/hooks/use-notification-settings";

export function NotificationSettings() {
  const { settings, handleSettingChange, saveEmailSettings, isLoading } = useNotificationSettings();

  return (
    <Card className="mt-8">
      <CardContent className="p-6 pt-[16px] pb-[16px]">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Notification Settings</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-medium text-foreground">Email Notifications</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Price Drop Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when prices drop below your target</p>
                </div>
                <Switch
                  checked={settings.emailPriceDrops}
                  onCheckedChange={(checked) => handleSettingChange('emailPriceDrops', checked)}
                />
              </div>
            </div>
            
            <div className="mt-4">
              <Label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-2">
                Email Address
              </Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={settings.email}
                  onChange={(e) => handleSettingChange('email', e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={saveEmailSettings}
                  disabled={isLoading}
                  size="sm"
                  className="px-3"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click save after changing your email address
              </p>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="font-medium text-foreground">Advanced Options</h3>
            
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-foreground">Check Frequency</p>
                </div>
                <Select 
                  value={settings.checkFrequency.toString()} 
                  onValueChange={(value) => handleSettingChange('checkFrequency', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">Every 12 hours</SelectItem>
                    <SelectItem value="24">Every 24 hours</SelectItem>
                    <SelectItem value="48">Every 48 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              
            </div>
            
            
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
