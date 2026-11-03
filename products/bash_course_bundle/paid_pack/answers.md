# Practice answers
A. Use `categories=("Invoices" "Receipts" "Reports" "Customer Reports")`. Quoted array expansion and quoted paths preserve the space. Expect Customer Reports/sample.txt in the archive.

B. Change the format string in the sample printf, keeping %s and the category argument. Create a new archive and restore it; the restored text should include your change.

C. From the course folder run `bash paid_pack/archive_solution.sh < /dev/null`. The script creates practice records, then prints Cancelled and exits successfully without creating an archive.

D. If the archive were inside the input tree, tar could encounter the file it was writing. Separate records and backup folders keep the input tree independent of the destination.

Assessment: records contains generated sample folders; backup holds the compressed archive. tar -t lists members, while tar -x extracts them. A restore check must inspect restored content. The error reporter exits nonzero when creation or listing fails.
