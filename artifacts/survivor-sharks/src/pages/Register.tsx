import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegisterUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation, Link, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LegalSiteFooter } from "@/components/LegalSiteFooter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { continuationPath, getPendingInviteCode } from "@/lib/pending-invite";
import { appendReturnToQuery, resolvePostAuthDestination } from "@/lib/post-auth-redirect";

const formSchema = z.object({
  realName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer")
    .refine((v) => /[\p{L}\p{N}]/u.test(v), "Name must include at least one letter or number"),
  displayName: z.string().trim().max(80, "Display name must be 80 characters or fewer").optional(),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  acceptedLegal: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms and Privacy Policy" }),
  }),
});

export default function Register() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const registerUser = useRegisterUser();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { realName: "", displayName: "", email: "", password: "", acceptedLegal: undefined },
  });

  const [location] = useLocation();
  const pendingCode = getPendingInviteCode(location);

  if (!isLoading && user && !pendingCode) {
    return <Redirect to={resolvePostAuthDestination(location, false)} replace />;
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    const displayName = values.displayName?.trim();
    registerUser.mutate(
      {
        data: {
          realName: values.realName.trim(),
          email: values.email,
          password: values.password,
          ...(displayName ? { displayName } : {}),
        },
      },
      {
        onSuccess: (data: any) => {
          if (data?.token) {
            localStorage.setItem("auth_token", data.token);
          }
          if (data?.user) {
            queryClient.setQueryData(getGetMeQueryKey(), data.user);
          }

          const pendingCode = getPendingInviteCode(location);
          if (pendingCode) {
            setLocation(continuationPath(pendingCode));
          } else {
            setLocation(resolvePostAuthDestination(location, false), { replace: true });
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Registration Failed",
            description: error?.data?.error || error?.message || "Failed to create account. That email may already be registered.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.1),rgba(10,14,26,1))] py-12">
      <Card className="w-full max-w-md shark-card border-border/50">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className="flex justify-center mb-3">
            <img src="/logo.png" alt="Survivor Sharks" className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(30,144,255,0.5)]" />
          </div>
          <CardTitle className="font-bebas text-4xl text-primary tracking-widest">JOIN THE SHARKS</CardTitle>
          <CardDescription className="text-muted-foreground uppercase tracking-wider font-medium text-xs">
            {pendingCode ? "Create an account to join the pool" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingCode && (
            <div className="mb-5 rounded-lg border border-primary/35 bg-primary/10 p-4 text-center space-y-3">
              <p className="text-sm text-foreground leading-snug">
                Invited to a pool? If you <span className="font-semibold">already have an account</span>, sign in — you don&apos;t need to register again.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full h-11 font-bebas text-lg tracking-widest"
                asChild
              >
                <Link
                  href={appendReturnToQuery("/login", location, pendingCode)}
                  data-testid="invite-banner-sign-in"
                >
                  Sign In Instead
                </Link>
              </Button>
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="realName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Domenic Molo" {...field} data-testid="input-real-name" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Your real name — shown in the pool People list so friends know who you are.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Display name <span className="text-muted-foreground text-sm font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="The Megalodon" {...field} data-testid="input-display-name" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Nickname on leaderboards and picks. Leave blank to use your name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="shark@example.com" {...field} data-testid="input-email" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bebas text-lg tracking-wide">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" className="bg-background/50 border-primary/20 focus-visible:ring-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="acceptedLegal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border border-border/40 bg-background/30 p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : undefined)}
                        data-testid="checkbox-accept-legal"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-snug">
                      <FormLabel className="text-xs font-normal text-muted-foreground cursor-pointer">
                        I am 18 or older and agree to the{" "}
                        <Link href="/terms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </Link>
                        .
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 font-bebas text-xl tracking-widest mt-6" disabled={registerUser.isPending} data-testid="button-submit-register">
                {registerUser.isPending ? "Creating Account..." : "Register"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={appendReturnToQuery("/login", location, pendingCode)} className="text-primary hover:underline hover:text-primary/80 font-medium" data-testid="link-to-login">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
      <LegalSiteFooter className="mt-6 max-w-md w-full" />
    </div>
  );
}
