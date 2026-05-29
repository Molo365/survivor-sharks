import { useAdminListPools, useAdminListUsers, useAdminUpdateUser, useAdminDeletePool, getAdminListPoolsQueryKey, getAdminListUsersQueryKey } from "@workspace/api-client-react";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Shield, User } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminDashboard() {
  const { data: pools, isLoading: loadingPools } = useAdminListPools();
  const { data: users, isLoading: loadingUsers } = useAdminListUsers();
  const deletePool = useAdminDeletePool();
  const updateUser = useAdminUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDeletePool = (id: number) => {
    deletePool.mutate(
      { poolId: id },
      {
        onSuccess: () => {
          toast({ title: "Pool deleted successfully" });
          queryClient.invalidateQueries({ queryKey: getAdminListPoolsQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to delete pool" });
        }
      }
    );
  };

  const handleUpdateRole = (userId: number, role: 'admin' | 'user') => {
    updateUser.mutate(
      { userId, data: { role } },
      {
        onSuccess: () => {
          toast({ title: "User role updated" });
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to update role" });
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <NavBar />
      
      <main className="flex-1 container px-4 py-8 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center gap-3">
          <Shield className="w-8 h-8 text-destructive" />
          <div>
            <h1 className="font-bebas text-4xl tracking-wide text-foreground">SUPER ADMIN</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-wider">System Management</p>
          </div>
        </div>

        <Tabs defaultValue="pools" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="pools" data-testid="tab-admin-pools">Pools</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-admin-users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="pools" className="space-y-4">
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Sport</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPools ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        <div className="flex justify-center"><Skeleton className="h-6 w-32" /></div>
                      </TableCell>
                    </TableRow>
                  ) : pools?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No pools found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pools?.map(pool => (
                      <TableRow key={pool.id} className="border-border/50">
                        <TableCell className="font-mono text-xs">{pool.id}</TableCell>
                        <TableCell className="font-medium">{pool.name}</TableCell>
                        <TableCell className="uppercase">{pool.sport}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${pool.isActive ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'}`}>
                            {pool.isActive ? 'Active' : 'Finished'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`button-delete-pool-${pool.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-destructive/20 shark-card">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-bebas text-2xl tracking-wide text-destructive">Delete Pool?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the pool
                                  "{pool.name}" and remove all associated data including picks and member records.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-muted text-foreground border-border hover:bg-muted/80">Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeletePool(pool.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Permanently
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>ID</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Pools</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        <div className="flex justify-center"><Skeleton className="h-6 w-32" /></div>
                      </TableCell>
                    </TableRow>
                  ) : users?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users?.map(user => (
                      <TableRow key={user.id} className="border-border/50">
                        <TableCell className="font-mono text-xs">{user.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{user.username}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>{user.poolCount ?? 0}</TableCell>
                        <TableCell>
                          <Select 
                            defaultValue={user.role} 
                            onValueChange={(val: 'admin' | 'user') => handleUpdateRole(user.id, val)}
                            disabled={updateUser.isPending}
                          >
                            <SelectTrigger className="w-[110px] h-8 text-xs bg-background/50 border-border" data-testid={`select-role-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin" className="text-destructive font-medium">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
