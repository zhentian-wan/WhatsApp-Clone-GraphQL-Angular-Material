import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Apollo, ApolloQueryObservable } from 'apollo-angular';
import { Subscription } from 'rxjs/Subscription';

import * as update from 'immutability-helper';

import 'rxjs/add/operator/map';

import { Inputs, Message } from '../message-list/message-list.component';
import { Outputs } from '../new-message/new-message.component';
import { AuthService } from '../../auth/auth.service';
// import { GetChatMessagesQuery } from '../../graphql-schema';

const allChatMessagesQuery = require('graphql-tag/loader!./get-chat-messages.graphql');
const sendMessageMutation = require('graphql-tag/loader!./send-message.graphql');
const getNewMessageSubscription = require('graphql-tag/loader!./get-new-message.graphql');
const removeChatMutation = require('graphql-tag/loader!./remove-chat.graphql');
const getAllChatsQuery = require('graphql-tag/loader!../chats-page/get-all-chats.graphql');
const getChatMembers = require('graphql-tag/loader!./get-chat-members.graphql');

@Component({
  selector: 'app-chat-page',
  templateUrl: './chat-page.component.html',
  styleUrls: ['./chat-page.component.scss']
})
export class ChatPageComponent implements OnInit, OnDestroy {
  chatId: string;
  messages: ApolloQueryObservable<Inputs.messages>;
  members: ApolloQueryObservable<any>;
  loggedInUser: any;
  newMessageSub: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apollo: Apollo,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.loggedInUser = this.auth.getUser();

    this.route.paramMap.subscribe(paramMap => {
      this.chatId = paramMap.get('chatId');

      this.members = this.apollo.watchQuery<any>({
        query: getChatMembers,
        variables: {
          chat: this.chatId,
          member: this.loggedInUser.id,
        },
      })
        .map(result => result.data.Chat.members) as any;

      this.messages = this.apollo.watchQuery<any /*GetChatMessagesQuery.Result*/>({
        query: allChatMessagesQuery,
        variables: {
          chat: this.chatId,
        },
        fetchPolicy: 'cache-and-network',
      })
        .map(result => result.data ? result.data.allMessages : [])
        .map(messages => messages.map(m => this.transformMessage(m))) as any;

        // new messages
        if (this.newMessageSub) {
          this.newMessageSub.unsubscribe();
          this.newMessageSub = undefined;
        }

        this.newMessageSub = this.apollo.subscribe({
          query: getNewMessageSubscription,
          variables: {
            chat: this.chatId,
          },
        }).subscribe((data) => {
          this.messages.updateQuery(
            (prev) => {
              // XXX Sometimes prev is empty...
              if (!prev || !prev.allMessages) {
                return;
              }

              return this.pushMessage(prev, data.Message.node);
            }
          );
        });
    });
  }

  onMessage(message: Outputs.message) {
    this.apollo.mutate({
      mutation: sendMessageMutation,
      variables: {
        chat: this.chatId,
        author: this.loggedInUser.id,
        content: message,
      },
      optimisticResponse: {
        __typename: 'Mutation',
        createMessage: {
          __typename: 'Message',
          id: null,
          content: message,
          author: {
            __typename: 'Member',
            id: this.loggedInUser.id,
            name: this.loggedInUser.name,
          },
        },
      },
      update: (proxy, result: any) => {
        // prepare
        const options: {
          query: any;
          variables: any; /*GetChatMessagesQuery.Variables*/
        } = {
          query: allChatMessagesQuery,
          variables: {
            chat: this.chatId,
          },
        };

        // read
        const data = proxy.readQuery(options);

        // write
        proxy.writeQuery({
          ...options,
          data: this.pushMessage(data, result.data.createMessage),
        });
      },
    }).subscribe(() => {
      //
    });
  }

  delete() {
    this.apollo.mutate({
      mutation: removeChatMutation,
      variables: {
        chat: this.chatId,
      },
      update: (proxy, result: any) => {
        const options = {
          query: getAllChatsQuery,
          variables: {
            member: this.loggedInUser.id,
          },
        };

        const data: any = proxy.readQuery(options);

        proxy.writeQuery({
          ...options,
          data: update(data, {
            allChats: {
              $set: data.allChats.filter(chat => chat.id !== result.data.deleteChat.id),
            },
          }),
        });
      }
    }).subscribe(() => {
      this.router.navigate(['/home']);
    });
  }

  private transformMessage(message: any /*GetChatMessagesQuery.AllMessages*/): Message {
    if (!message) {
      return;
    }

    return {
      ...message,
      own: message.author.id === this.loggedInUser.id,
    };
  }

  private pushMessage(prev: any /*GetChatMessagesQuery.Result*/, message: Message): any /*GetChatMessagesQuery.Result*/ {
    if (!prev || !prev.allMessages) {
      return { allMessages: [message] };
    }

    if (prev.allMessages.some(m => m.id === message.id)) {
      return prev;
    }

    return update(prev, {
      allMessages: {
        $push: [message]
      }
    });
  }

  ngOnDestroy() {
    if (this.newMessageSub) {
      this.newMessageSub.unsubscribe();
      this.newMessageSub = undefined;
    }
  }
}
