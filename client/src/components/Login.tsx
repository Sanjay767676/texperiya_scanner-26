import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff } from 'lucide-react';
import skeletonLogo from '@/assets/skeleton.png';

interface LoginProps {
  onLogin: (user: { id: string; username: string }, rememberMe?: boolean) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        onLogin(data.user, rememberMe);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      <div className="absolute inset-0 bg-black" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 35%, rgba(0,0,0,0) 65%)',
        }}
      />
      <img
        src={skeletonLogo}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute left-1/2 top-1/2 h-[65vmin] w-[65vmin] max-h-[620px] max-w-[620px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-20 blur-[1px]"
      />
      <div className="absolute inset-0 bg-black/35" />

      <div className="absolute inset-0 opacity-15">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/20 bg-white/[0.08] p-8 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-3xl font-bold text-white">Welcome Back</h1>
              <p className="text-white/70">Sign in to access Texperia Scanner</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white/85 font-medium">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 rounded-xl border-white/25 bg-white/10 text-white placeholder:text-white/50 backdrop-blur-md focus-visible:ring-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/85 font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-12 rounded-xl border-white/25 bg-white/10 text-white placeholder:text-white/50 backdrop-blur-md pr-12 focus-visible:ring-white/40"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg p-0 text-white/75 hover:bg-white/10"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(!!checked)}
                  disabled={isLoading}
                  className="border-white/35 data-[state=checked]:bg-white/85 data-[state=checked]:text-black data-[state=checked]:border-white/85"
                />
                <Label htmlFor="rememberMe" className="cursor-pointer text-white/80">
                  Keep me signed in for 30 days
                </Label>
              </div>

              {error && (
                <Alert className="border-red-400/45 bg-red-500/20">
                  <AlertDescription className="text-red-100">{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl border border-white/35 bg-white/20 text-white font-semibold backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_10px_28px_rgba(0,0,0,0.55)] liquid-glass transition-none no-default-hover-elevate no-default-active-elevate hover:bg-white/20 active:bg-white/20"
              >
                {isLoading ? 'Signing you in...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
