import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Mail, Phone, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PIPELINE_STAGES = [
  'Cold Lead',
  'Interested',
  'Meeting Booked',
  'Follow-Up',
  'Closed',
  'Inactive'
];

export default function ClientDetail() {
  const navigate = useNavigate();
  const currentStage = 'Meeting Booked';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Acme Corp</h1>
            <p className="text-muted-foreground mt-1">Added 2 days ago</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Edit className="w-4 h-4" />
            Edit
          </Button>
        </div>
      </div>

      <Card className="border border-border shadow-sm p-6 overflow-hidden">
        <div className="flex justify-between items-center relative">
          <div className="absolute left-0 top-1/2 w-full h-[2px] bg-muted -z-10 -translate-y-1/2" />
          {PIPELINE_STAGES.map((stage, index) => {
            const isCompleted = PIPELINE_STAGES.indexOf(currentStage) >= index;
            const isCurrent = currentStage === stage;
            
            return (
              <div key={stage} className="flex flex-col items-center gap-2 bg-card px-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${isCompleted ? 'bg-accent border-accent text-accent-foreground' : 'bg-card border-border text-muted-foreground'} ${isCurrent ? 'ring-4 ring-accent/20' : ''}`}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                <span className={`text-xs font-medium ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 md:col-span-2 border border-border shadow-sm">
          <CardHeader>
            <CardTitle>Client Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 rounded-xl p-4 text-sm min-h-[200px]">
              <p>Discussed potential integration with their current stack. They are looking to move forward by Q3.</p>
              <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Added by JD today at 10:30 AM</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input type="text" placeholder="Add a new note..." className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              <Button>Add</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle>Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>contact@acmecorp.com</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <CalendarIcon className="w-4 h-4" />
                <span>Next Follow-up: Tomorrow</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
