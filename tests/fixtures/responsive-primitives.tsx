import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Textarea } from "../../src/components/ui/textarea";
import { Label } from "../../src/components/ui/label";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "../../src/components/ui/dialog";
export default function ResponsivePrimitives() {
  return <main className="mx-auto max-w-3xl px-4 py-8"><h1 className="mb-6 text-3xl font-semibold">Responsive form and dialog fixture</h1>
    <div className="space-y-5"><div><Label htmlFor="fixture-title">Project title</Label><Input id="fixture-title" placeholder="A descriptive project title" /></div><div><Label htmlFor="fixture-brief">Naming brief</Label><Textarea id="fixture-brief" placeholder="A longer project description" /></div></div>
    <Dialog><DialogTrigger asChild><Button className="mt-6">Open long dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>A long project review with editable details</DialogTitle><DialogDescription>Local fixture for layout, scrolling, focus and dismissal. No information is submitted.</DialogDescription></DialogHeader>
      <div className="space-y-5">{Array.from({ length: 10 }, (_, index) => <div key={index}><Label htmlFor={`dialog-field-${index}`}>Review detail {index + 1}</Label><Input id={`dialog-field-${index}`} defaultValue={`Synthetic review detail ${index + 1}`} /><p className="mt-2 text-sm leading-6 text-muted-foreground">Review the wording, market fit, spelling, and supporting evidence before continuing to the next detail.</p></div>)}</div>
      <DialogFooter><DialogClose asChild><Button>Finish review</Button></DialogClose></DialogFooter></DialogContent></Dialog>
  </main>;
}
