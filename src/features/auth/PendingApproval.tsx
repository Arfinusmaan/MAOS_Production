import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';

export default function PendingApproval() {
  return (
    <Card className="w-full text-center">
      <CardHeader>
        <div className="mx-auto w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-4">
          <Clock className="w-6 h-6 text-accent" />
        </div>
        <CardTitle className="text-2xl">Pending Approval</CardTitle>
        <CardDescription>Your account is currently under review</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          An administrator needs to approve your account and assign your role before you can access the dashboard. We'll notify you once you've been approved.
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Button variant="outline" asChild>
          <Link to="/login">Back to Login</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
