package main

import (
	"context"
	"net/http"

	"cloud.google.com/go/datastore"
)

var datastoreClient *datastore.Client

func main() {
	ctx := context.Background()
	datastoreClient, _ = datastore.NewClient(ctx, "go-vim")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		panic(err)
	}
}
