import { useAdminListUsers, useAdminUpdateUser, useAdminDeleteUser, getAdminListUsersQueryKey } from "@workspace/api-client-react";
import type { AdminUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

export default function AdminUsers() {
  const { user } = useAuth();
  const { data: users, isLoading } = useAdminListUsers();
  const updateUser = useAdminUpdateUser();
  const deleteUser = useAdminDeleteUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const filtered = (users ?? []).filter((u: AdminUser) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function handleDelete(userId: number, username: string) {
    deleteUser.mutate(
      { userId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
          toast({ title: `${username} deleted` });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to delete user" }),
      },
    );
  }

  function handleRoleChange(userId: number, role: string) {
    updateUser.mutate(
      { userId, data: { role: role as "user" | "admin" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
          toast({ title: "Role updated" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to update role" }),
      },
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🦈</span>
            <h1 className="font-bebas text-4xl text-primary tracking-widest">USER DATABASE</h1>
          </div>
          <p className="text-muted-foreground text-sm uppercase tracking-wider">
            Registered accounts — {users?.length ?? 0} total
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search by username, email, or display name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md bg-background/50 border-primary/20 focus-visible:ring-primary/50"
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden shark-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">ID</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Username</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Display Name</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Email</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Role</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Pools</TableHead>
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Joined</TableHead>
                {user?.role === "admin" && (
                  <TableHead className="font-bebas text-base tracking-wider text-muted-foreground">Change Role</TableHead>
                )}
                <TableHead className="font-bebas text-base tracking-wider text-muted-foreground text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <div className="animate-pulse">Loading users…</div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u: AdminUser) => (
                  <TableRow key={u.id} className="border-border/50 hover:bg-primary/5 transition-colors">
                    <TableCell className="text-muted-foreground font-mono text-sm">{u.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.displayName ?? <span className="opacity-40">—</span>}</TableCell>
                    <TableCell className="text-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className={
                          u.role === "admin"
                            ? "bg-primary/20 text-primary border-primary/30 font-bebas tracking-wide"
                            : "bg-muted text-muted-foreground font-bebas tracking-wide"
                        }
                      >
                        {u.role.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-center">{u.poolCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    {user?.role === "admin" && (
                      <TableCell>
                        <Select
                          defaultValue={u.role}
                          onValueChange={(val) => handleRoleChange(u.id, val)}
                          disabled={u.id === user?.id}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs bg-background/50 border-primary/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {u.role !== "admin" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="border-destructive/20">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Delete User?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {u.username}? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(u.id, u.username)}
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              >
                                Delete Permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground/50 text-center">
          Password hashes are never displayed. This view is restricted to administrators.
        </p>
      </div>
    </div>
  );
}
