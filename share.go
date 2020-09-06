// Copyright 2011 The Go Authors.  All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"

	"cloud.google.com/go/datastore"
)

const salt = "[replace this with something unique]"

var datastoreClient *datastore.Client

type Snippet struct {
	Body []byte
}

func (s *Snippet) Id() string {
	h := sha1.New()
	io.WriteString(h, salt)
	h.Write(s.Body)
	sum := h.Sum(nil)
	b := make([]byte, base64.URLEncoding.EncodedLen(len(sum)))
	base64.URLEncoding.Encode(b, sum)
	return string(b)[:10]
}

func init() {
	ctx := context.Background()
	datastoreClient, _ = datastore.NewClient(ctx, "go-vim")
	http.HandleFunc("/share", share)
}

func share(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	ctx := context.Background()

	var body bytes.Buffer
	_, err := body.ReadFrom(r.Body)
	if err != nil {
		log.Fatalf("reading Body: %v", err)
		http.Error(w, "Server Error", http.StatusInternalServerError)
		return
	}
	r.Body.Close()
	snip := &Snippet{Body: body.Bytes()}
	id := snip.Id()
	key := datastore.NameKey("Snippet", id, nil)
	_, err = datastoreClient.Put(ctx, key, snip)
	if err != nil {
		log.Fatalf("putting Snippet: %v", err)
		http.Error(w, "Server Error", http.StatusInternalServerError)
		return
	}

	fmt.Fprint(w, id)
}
