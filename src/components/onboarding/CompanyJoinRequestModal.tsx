import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Building2, Users, Loader2, ArrowLeft } from "lucide-react";
import { CompanyMatch, useCreateJoinRequest } from "@/hooks/useCompanyJoinRequests";

interface CompanyJoinRequestModalProps {
  companies: CompanyMatch[];
  userDomain: string;
  onRequestSent: () => void;
  onCancel: () => void;
}

export function CompanyJoinRequestModal({
  companies,
  userDomain,
  onRequestSent,
  onCancel,
}: CompanyJoinRequestModalProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    companies.length === 1 ? companies[0].id : ""
  );
  const [note, setNote] = useState("");
  const createJoinRequest = useCreateJoinRequest();

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const showSelection = companies.length > 1;

  const handleSubmit = async () => {
    if (!selectedCompanyId) return;
    
    await createJoinRequest.mutateAsync({
      companyId: selectedCompanyId,
      note: note.trim() || undefined,
    });
    onRequestSent();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join your company on naitive</CardTitle>
          <CardDescription className="text-base">
            {showSelection
              ? `Your email domain (${userDomain}) is associated with multiple companies. Select which one you'd like to join.`
              : `Your email domain (${userDomain}) is already associated with ${selectedCompany?.name || "a company"}. To protect your company's data, an admin must approve your access.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showSelection && (
            <div className="space-y-3">
              <Label>Select a company</Label>
              <RadioGroup
                value={selectedCompanyId}
                onValueChange={setSelectedCompanyId}
                className="space-y-2"
              >
                {companies.map((company) => (
                  <label
                    key={company.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCompanyId === company.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <RadioGroupItem value={company.id} />
                    <Avatar className="h-10 w-10">
                      {company.logo_url ? (
                        <AvatarImage src={company.logo_url} />
                      ) : null}
                      <AvatarFallback>
                        {company.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {company.member_count} member{company.member_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {!showSelection && selectedCompany && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Avatar className="h-10 w-10">
                {selectedCompany.logo_url ? (
                  <AvatarImage src={selectedCompany.logo_url} />
                ) : null}
                <AvatarFallback>
                  {selectedCompany.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedCompany.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {selectedCompany.member_count} member{selectedCompany.member_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Reason for joining (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., I'm a new team member starting this week..."
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!selectedCompanyId || createJoinRequest.isPending}
              className="w-full"
            >
              {createJoinRequest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending request...
                </>
              ) : (
                "Send Request"
              )}
            </Button>
            <Button variant="ghost" onClick={onCancel} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You won't be able to access company data until an admin approves your request.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
